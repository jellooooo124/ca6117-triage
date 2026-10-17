FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/app/.cache/huggingface

RUN useradd -m -u 1000 user
WORKDIR /app

# 先裝 CPU 版 PyTorch，避免下載好幾 GB 的 GPU 版
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 建置時就下載 embedding 模型，避免第一次請求等很久
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

COPY . .
RUN mkdir -p runtime && chown -R user:user /app
USER user

EXPOSE 7860
CMD ["python", "-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "7860"]
