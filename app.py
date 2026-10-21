"""Точка входа бота. Весь код разнесён по папке tgbot/ (см. tgbot/README.md).

Запуск остаётся прежним: python app.py
"""

import asyncio
import threading

from tgbot.main import main, run_http_server

if __name__ == "__main__":
    # 1. Запускаем HTTP-сервер в фоновом потоке (чтобы Render видел порт и отдавал /draw)
    server_thread = threading.Thread(target=run_http_server, daemon=True)
    server_thread.start()

    # 2. Запускаем Telegram-бота в основном потоке
    asyncio.run(main())
