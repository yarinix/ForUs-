# static — клиенты

| Папка | Что это | Как собирается |
|---|---|---|
| `pet/` | игра «Наша выдра» (`/pet`) | `pet/index.html` + части, см. `pet/README.md` |
| `draw/` | холст для рисования (`/draw`) | `draw/index.html` + `css/` + `js/` |
| `garden/` | сад (`/pet-garden/*`) | `garden/garden.js` собирается из `garden/js/` |

Строки `// @include путь` заменяются содержимым файла на сервере (`tgbot/webserver.py → build_page`).
