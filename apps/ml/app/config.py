import os
from pydantic import BaseModel

class Settings(BaseModel):
    service_name: str = "ananya-ml"
    service_version: str = "1.0.0"
    model_dir: str = os.getenv("MODEL_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models")))
    category_model_path: str = os.getenv("CATEGORY_MODEL_PATH", "")
    category_knowledge_path: str = os.getenv("CATEGORY_KNOWLEDGE_PATH", "")
    manufacturer_knowledge_path: str = os.getenv(
        "MANUFACTURER_KNOWLEDGE_PATH",
        os.getenv("MANUFACTURER_CATALOG_PATH", ""),
    )
    enable_onnx_embeddings: bool = os.getenv("ENABLE_ONNX_EMBEDDINGS", "false").lower() in ("true", "1", "yes")
    onnx_model_path: str = os.getenv("ONNX_MODEL_PATH", "/tmp/minilm/onnx/model_quantized.onnx")
    onnx_tokenizer_path: str = os.getenv("ONNX_TOKENIZER_PATH", "/tmp/minilm/tokenizer.json")
    max_request_size_bytes: int = 10 * 1024 * 1024  # 10 MB limit

settings = Settings()
if not settings.category_model_path:
    settings.category_model_path = os.path.join(settings.model_dir, "category_classifier.pkl")
if not settings.category_knowledge_path:
    settings.category_knowledge_path = os.path.join(settings.model_dir, "category_knowledge.json")
if not settings.manufacturer_knowledge_path:
    settings.manufacturer_knowledge_path = os.path.join(settings.model_dir, "manufacturer_knowledge.json")
