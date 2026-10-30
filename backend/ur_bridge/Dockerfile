# ur_rtde ships Linux/Windows wheels only, so the bridge runs in this container (amd64; emulated on Apple Silicon).
FROM --platform=linux/amd64 python:3.12-slim
RUN pip install --no-cache-dir ur-rtde==1.6.5
WORKDIR /srv
COPY executor.py server.py __init__.py ur_bridge/
ENV PYTHONUNBUFFERED=1 UR_HOST=ursim BRIDGE_PORT=8765
EXPOSE 8765
CMD ["python", "-m", "ur_bridge.server"]
