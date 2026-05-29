import os
import sys
from huggingface_hub import HfApi, login

def upload_models_to_hub(repo_id="raj0120/edge-face-pipeline", token=None):
    token = token or os.getenv("HF_TOKEN")
    if not token:
        token = input("Enter your Hugging Face Access Token (with write permissions): ").strip()
    if not token:
        raise EnvironmentError(
            "Hugging Face token not found. Set HF_TOKEN in the environment or provide it manually."
        )

    print(f"[INFO] Authenticating to Hugging Face Hub...")
    try:
        login(token=token, add_to_git_credential=True)
        api = HfApi()
        
        # Create repo if it doesn't exist
        print(f"[INFO] Creating or verifying repository: {repo_id}")
        api.create_repo(repo_id=repo_id, exist_ok=True, private=False)
        
        # Project Root
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

        # Models to upload (local relative path, repo path)
        models_to_upload = [
            ("edge_vision_engine/checkpoints/ghostfacenet_epoch_3.pt", "ghostfacenet_epoch_3.pt"),
            ("edge_vision_engine/models/weights/linzaer_version_rfb_320.pth", "linzaer_version_rfb_320.pth"),
            ("edge_vision_engine/models/weights/mini_fas_net_v1se.pth", "mini_fas_net_v1se.pth"),
            ("edge_vision_engine/checkpoints/onnx/ghostfacenet.onnx", "ghostfacenet.onnx"),
            ("edge_vision_engine/checkpoints/onnx/liveness.onnx", "liveness.onnx"),
            ("edge_vision_engine/checkpoints/onnx/detector.onnx", "detector.onnx")
        ]

        print(f"[INFO] Found 3 models to upload. Committing to hub...")
        for local_rel_path, repo_path in models_to_upload:
            local_path = os.path.join(project_root, local_rel_path)
            if not os.path.exists(local_path):
                print(f"[WARNING] Local model file not found: {local_path}. Skipping...")
                continue

            print(f"  -> Uploading {repo_path}...")
            api.upload_file(
                path_or_fileobj=local_path,
                path_in_repo=repo_path,
                repo_id=repo_id,
                commit_message=f"Upload model weights: {repo_path}"
            )
            
        print(f"[SUCCESS] All weights uploaded to https://huggingface.co/{repo_id}")
        
    except Exception as e:
        print(f"[ERROR] Failed to push to Hugging Face Hub: {e}")
        
if __name__ == "__main__":
    upload_models_to_hub()
