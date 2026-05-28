import os
import sys
from huggingface_hub import HfApi, login

def upload_models_to_hub(repo_id="raj0120/edge-face-pipeline", token=None, checkpoint_dir="p:/Hackathons/NHAI Facial Recognition/phase1_edge_ai/checkpoints"):
    token = token or os.getenv("HF_TOKEN")
    if not token:
        raise EnvironmentError(
            "Hugging Face token not found. Set HF_TOKEN in the environment or pass it explicitly."
        )

    print(f"[INFO] Authenticating to Hugging Face Hub...")
    try:
        login(token=token)
        api = HfApi()
        
        # Create repo if it doesn't exist
        print(f"[INFO] Creating or verifying repository: {repo_id}")
        api.create_repo(repo_id=repo_id, exist_ok=True, private=False)
        
        # Find the latest checkpoint
        checkpoints = [f for f in os.listdir(checkpoint_dir) if f.endswith(".pt") or f.endswith(".tflite")]
        
        if not checkpoints:
            print(f"[ERROR] No model weights found in {checkpoint_dir}")
            return
            
        print(f"[INFO] Found {len(checkpoints)} weights to upload. Committing to hub...")
        for ckpt in checkpoints:
            ckpt_path = os.path.join(checkpoint_dir, ckpt)
            print(f"  -> Uploading {ckpt}...")
            api.upload_file(
                path_or_fileobj=ckpt_path,
                path_in_repo=ckpt,
                repo_id=repo_id,
                commit_message=f"Upload NHAI Hackathon fine-tuned weights: {ckpt}"
            )
            
        print(f"[SUCCESS] All weights uploaded to https://huggingface.co/{repo_id}")
        
    except Exception as e:
        print(f"[ERROR] Failed to push to Hugging Face Hub: {e}")
        
if __name__ == "__main__":
    upload_models_to_hub()
