import os
from huggingface_hub import HfApi
from dotenv import load_dotenv

load_dotenv()

# Configuration
REPO_ID = "raj0120/edge-face-pipeline"
HF_TOKEN = os.getenv("HF_TOKEN")
ONNX_DIR = "models_onnx"

def upload_models():
    if not HF_TOKEN:
        print("Error: HF_TOKEN not found in .env file.")
        return

    print(f"Uploading ONNX models from {ONNX_DIR} to {REPO_ID}...")
    
    try:
        api = HfApi()
        # Create repo if it doesn't exist
        api.create_repo(repo_id=REPO_ID, token=HF_TOKEN, exist_ok=True, private=False)
        
        # Upload all files in the onnx directory
        for filename in os.listdir(ONNX_DIR):
            file_path = os.path.join(ONNX_DIR, filename)
            if os.path.isfile(file_path):
                print(f"Uploading {filename}...")
                api.upload_file(
                    path_or_fileobj=file_path,
                    path_in_repo=filename,
                    repo_id=REPO_ID,
                    repo_type="model",
                    token=HF_TOKEN
                )
        print("\nAll models uploaded successfully!")
    except Exception as e:
        print(f"Failed to upload models: {e}")

if __name__ == "__main__":
    upload_models()
