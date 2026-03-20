import os
import re
import logging
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client

# ==========================================
# 1. CONFIGURACIÓN INICIAL Y LOGS
# ==========================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY]):
    logger.error("Faltan variables de entorno. Verifica tu archivo data-pipeline/.env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. FUNCIONES DE LIMPIEZA Y ENRIQUECIMIENTO
# ==========================================

def clean_article_name(texto_art: str) -> str:
    """
    Toma algo como 'Artículo 76 bis' o 'Art. 76 bis' 
    y retorna '76 bis'. Atrapa también números y letras.
    Esto permite que la BD y el XML hagan match perfectamente.
    """
    # Removemos 'Artículo ', 'Art. ', 'Art ', ignorando mayúsculas
    limpio = re.sub(r'(?i)^art(?:ículo|\.)?\s*', '', texto_art.strip())
    # Limpiamos ordinales como 'º' o '°'
    limpio = limpio.replace('º', '').replace('°', '')
    return limpio.strip().lower()

def safe_decode(texto: str) -> str:
    """
    Limpia errores de codificación UTF-8 comunes (ej: CÃ³digo -> Código).
    Esta es una cirugía estética para sanear la BD en paralelo al update.
    """
    if not texto:
        return texto
    try:
        # Intentamos decodificar si fue guardado malamente
        if 'Ã' in texto: 
            return texto.encode('latin1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    return texto

def fetch_bcn_xml(norma_id: str) -> str:
    url = f"https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma={norma_id}"
    logger.info(f"Descargando XML desde: {url}")
    res = requests.get(url, timeout=15)
    res.raise_for_status()
    # Forzamos utf-8 para no perder info vital en el parseo
    res.encoding = 'utf-8'
    return res.text

def process_enrichment(norma_id: str):
    logger.info("Obteniendo artículos actuales de la Base de Datos...")
    
    # Traer todos los documentos de esa norma de la BD 
    # (NOTA: EXCLUIMOS explicitamente el 'embedding' que es pesado y no se tocará)
    db_response = supabase.table("legal_documents").select("id, articulo, nombre_ley, contenido").eq("norma_id", norma_id).execute()
    db_records = db_response.data
    
    if not db_records:
        logger.warning(f"No hay registros en la base de datos para la norma {norma_id}.")
        return

    logger.info(f"Se encontraron {len(db_records)} registros en BD.")
    
    # Construir mapa de búsqueda en O(1) usando el número/letra limpio
    db_map = {}
    for record in db_records:
        normalized_art = clean_article_name(record['articulo'])
        # Si hubiese duplicados el último pisa el primero, pero BCN es única por artículo
        db_map[normalized_art] = record
    
    logger.info("Analizando el XML oficial de la BCN...")
    xml_content = fetch_bcn_xml(norma_id)
    soup = BeautifulSoup(xml_content, 'xml')
    
    # Buscar estructuras que sean artículos
    estructuras = soup.find_all('EstructuraFuncional')
    
    matches_count = 0
    fail_count = 0

    for est in estructuras:
        tipo_parte = est.get('tipoParte', '')
        if 'art' in tipo_parte.lower():
            id_parte_bcn = est.get('idParte', '')
            
            nombre_parte_tag = est.find('NombreParte')
            if not nombre_parte_tag:
                 continue
                 
            xml_nombre = nombre_parte_tag.text.strip()
            xml_normalized = clean_article_name(xml_nombre)
            
            # MAGIA: Hacemos match a través de la normalización
            if xml_normalized in db_map:
                record = db_map[xml_normalized]
                
                # Limpiamos UTF-8 defectuoso
                clean_nombre_ley = safe_decode(record['nombre_ley'])
                clean_contenido = safe_decode(record['contenido'])
                
                # Preparamos el update con el field nuevo y los fields limpios
                update_data = {
                    "id_parte_bcn": id_parte_bcn,
                    "nombre_ley": clean_nombre_ley,
                    "contenido": clean_contenido
                }
                
                try:
                    # UPDATE puntual sin sobreescribir vectores
                    supabase.table("legal_documents").update(update_data).eq("id", record["id"]).execute()
                    matches_count += 1
                except Exception as e:
                    logger.error(f"Error actualizando DB id {record['id']}: {e}")
                    
                # Eliminar del mapa para no volver a matchearlo
                del db_map[xml_normalized]
            else:
                fail_count += 1

    logger.info("==================================================")
    logger.info(f"RESUMEN DE ENRIQUECIMIENTO (Norma {norma_id}):")
    logger.info(f"✅ Artículos enlazados a ID BCN (y limpiados): {matches_count}")
    logger.info(f"❌ Artículos en XML ignorados (no estaban en DB): {fail_count}")
    
    # Todo lo que quedó en el mapa son artículos de DB que no hacían match con XML
    if len(db_map) > 0:
        faltantes = list(db_map.keys())[:5]
        logger.warning(f"⚠️ {len(db_map)} Artículos en DB huérfanos sin link BCN. Ejemplos de fallos: {faltantes}")
    logger.info("==================================================")

# ==========================================
# 3. EJECUCIÓN
# ==========================================
if __name__ == "__main__":
    NORMA_OBJETIVO = "207436"
    process_enrichment(NORMA_OBJETIVO)
