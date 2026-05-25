"""
Sichere Bild-Generierung via diffusers (Hugging Face).
Wird als separater Prozess aufgerufen, um Code Injection zu vermeiden.
"""
import sys
import json

def main():
    if len(sys.argv) < 2:
        print("ERROR: Kein Config-Argument", file=sys.stderr)
        sys.exit(1)

    try:
        config = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(f"ERROR: Ungueltiges JSON: {e}", file=sys.stderr)
        sys.exit(1)

    prompt = config.get('prompt', '')
    out_path = config.get('outPath', '/tmp/output.png')
    steps = config.get('steps', 15)
    guidance = config.get('guidance', 7.0)
    width = config.get('width', 512)
    height = config.get('height', 512)

    if not prompt:
        print("ERROR: Kein Prompt angegeben", file=sys.stderr)
        sys.exit(1)

    try:
        from diffusers import StableDiffusionPipeline
        import torch
    except ImportError:
        print("NO_DIFFUSERS")
        sys.exit(1)

    try:
        pipe = StableDiffusionPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            torch_dtype=torch.float32
        )
        pipe = pipe.to("cpu")
        pipe.enable_attention_slicing()

        image = pipe(
            prompt,
            num_inference_steps=steps,
            guidance_scale=guidance,
            width=width,
            height=height
        ).images[0]

        image.save(out_path)
        print("OK")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
