import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

import spaces
import gradio as gr
import uvicorn
from app.main import app


@spaces.GPU
def _placeholder():
    return "ok"


with gr.Blocks() as demo:
    gr.Markdown("CA6117 triage API is running. Try /health")
    btn = gr.Button("ping")
    out = gr.Textbox()
    btn.click(_placeholder, None, out)

app = gr.mount_gradio_app(app, demo, path="/ui")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
