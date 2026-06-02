import os
import urllib.request
import sys

REPO_ID = "raj0120/edge-face-pipeline"
MODELS = ["linzaer_detector_int8.onnx", "ghostfacenet_s_int8.onnx", "mini_fas_net_int8.onnx"]
ASSETS_DIR = "src/main/assets"

def download_models():
    print("Ensuring Hugging Face models are downloaded to Android assets...")
    os.makedirs(ASSETS_DIR, exist_ok=True)
    
    for model in MODELS:
        url = f"https://huggingface.co/{REPO_ID}/resolve/main/{model}"
        out_path = os.path.join(ASSETS_DIR, model)
        if os.path.exists(out_path):
            print(f"{model} already exists at {out_path}, skipping download.")
            continue
            
        print(f"Downloading {model} from Hugging Face...")
        try:
            urllib.request.urlretrieve(url, out_path)
            print(f"Successfully downloaded {model}")
        except Exception as e:
            print(f"Failed to download {model}: {e}")
            sys.exit(1)

if __name__ == "__main__":
    download_models()
