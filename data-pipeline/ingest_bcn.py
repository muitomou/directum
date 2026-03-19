import os
import logging
from typing import List, Dict, Optional
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client

# IMPORTANTE: La nueva librería de Gemini
from google import genai 

# ==========================================
# 1. CONFIGURACIÓN INICIAL Y LOGS
# ==========================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

# Cargar variables de entorno desde el archivo .env (ahora sí lo encontrará)
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not all([GEMINI_API_KEY, SUPABASE_URL, SUPABASE_KEY]):
    logger.error("Faltan variables de entorno. Verifica tu archivo data-pipeline/.env")
    exit(1)

# Inicializar clientes (Sintaxis actualizada)
gemini_client = genai.Client(api_key=GEMINI_API_KEY)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. FUNCIONES DEL PIPELINE (ETL)
# ==========================================

def fetch_bcn_xml(norma_id: str) -> Optional[str]:
    url = f"https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma={norma_id}"
    logger.info(f"Descargando XML de la BCN para la norma {norma_id}...")
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        logger.info("XML descargado con éxito.")
        return response.text
    except requests.exceptions.RequestException as e:
        logger.error(f"Error al descargar la norma {norma_id}: {e}")
        return None

def parse_articles(xml_content: str, norma_id: str) -> List[Dict]:
    logger.info("Parseando el XML de la BCN con el esquema oficial...")
    
    # Usamos lxml explícitamente para evitar problemas de compatibilidad
    soup = BeautifulSoup(xml_content, 'xml')
    
    # 1. Extraer el nombre de la ley
    titulo_tag = soup.find('TituloNorma')
    nombre_ley = titulo_tag.text.strip() if titulo_tag else f"Norma {norma_id} (Código del Trabajo)"
    logger.info(f"Ley detectada: {nombre_ley}")
    
    articulos_data = []
    
    # 2. Buscar todas las estructuras funcionales
    estructuras = soup.find_all('EstructuraFuncional')
    logger.info(f"Se encontraron {len(estructuras)} estructuras funcionales. Filtrando artículos...")
    
    for est in estructuras:
        # 3. Validar que la estructura sea realmente un Artículo
        tipo_parte = est.get('tipoParte', '')
        
        # Ignoramos mayúsculas/minúsculas y tildes por seguridad
        if 'art' in tipo_parte.lower(): 
            
            # 4. Extraer el texto real
            texto_tag = est.find('Texto')
            if not texto_tag:
                continue
            texto_limpio = texto_tag.get_text(separator=' ', strip=True)
            
            # 5. Extraer el número del artículo (está anidado en Metadatos -> NombreParte)
            nombre_parte_tag = est.find('NombreParte')
            numero_art = nombre_parte_tag.text.strip() if nombre_parte_tag else "S/N"
            
            # 6. Filtros de calidad: Ignorar artículos vacíos o derogados
            es_valido = len(texto_limpio) > 20 and "DEROGADO" not in texto_limpio.upper()
            
            if es_valido:
                articulos_data.append({
                    "norma_id": norma_id,
                    "nombre_ley": nombre_ley,
                    "articulo": f"Art. {numero_art}",
                    "contenido": texto_limpio
                })
                
    logger.info(f"Extracción exitosa: {len(articulos_data)} artículos listos para vectorizar.")
    return articulos_data

def generate_embedding(text: str) -> Optional[List[float]]:
    """Genera un vector embedding usando la nueva sintaxis y el modelo actualizado."""
    try:
        response = gemini_client.models.embed_content(
            model="gemini-embedding-001",  # <-- ¡Aquí está el cambio clave!
            contents=text,
        )
        return response.embeddings[0].values
    except Exception as e:
        logger.error(f"Error al generar embedding: {e}")
        return None
def save_to_supabase(data: Dict):
    try:
        response = supabase.table("legal_documents").insert(data).execute()
        return response
    except Exception as e:
        logger.error(f"Error al guardar en Supabase el {data.get('articulo')}: {e}")
        return None

# ==========================================
# 3. EJECUCIÓN PRINCIPAL (MAIN)
# ==========================================

def main():
    NORMA_OBJETIVO = "207436" 
    
    xml_content = fetch_bcn_xml(NORMA_OBJETIVO)
    if not xml_content:
        return
        
    articulos = parse_articles(xml_content, NORMA_OBJETIVO)
    if not articulos:
        return
        
    logger.info(f"Iniciando generación de embeddings e inserción para {len(articulos)} artículos...")
    articulos_insertados = 0
    
    for item in articulos:
        embedding = generate_embedding(item["contenido"])
        if embedding:
            item["embedding"] = embedding
            save_result = save_to_supabase(item)
            if save_result:
                articulos_insertados += 1
                logger.info(f"Guardado exitoso: {item['articulo']}")
    
    logger.info("==================================================")
    logger.info(f"PROCESO TERMINADO. {articulos_insertados}/{len(articulos)} artículos insertados.")
    logger.info("==================================================")

if __name__ == "__main__":
    main()