# Как на самом деле ведут себя эндпоинты LM Studio

Измерено `curl`-запросами к `localhost:1234` 1 октября 2026 года на двух моделях: Qwen3.5-0.8B (GGUF, Q8_0) и Ternary-Bonsai-27B (MLX, 2 бита). Документация LM Studio с этим расходится, после обновления LM Studio стоит перепроверить.

## Логпробы

| Эндпоинт | Логпробы с кандидатами |
|---|---|
| `/v1/completions` | нет, всегда `logprobs: null` |
| `/api/v0/completions` | нет |
| `/v1/chat/completions` | да (`logprobs: true`, `top_logprobs: N`) |
| `/v1/responses` | да (`include: ["message.output_text.logprobs"]`, `top_logprobs: N`) |

Работает на обоих движках, GGUF и MLX. `top_logprobs` принимает и значения больше 20.

## Формат `/v1/responses`

Без стрима: `output[].content[].logprobs[]`, элемент — `{token, logprob, bytes, top_logprobs: [{token, logprob, bytes}]}`.

В стриме события идут в таком порядке: `response.created`, `response.in_progress`, `response.output_item.added`, `response.content_part.added`, затем `response.output_text.delta` (в каждом — `delta` и `logprobs` на один токен), `response.output_text.done`, `response.content_part.done`, `response.output_item.done`, `response.completed`. Строки `[DONE]` в конце нет.

Поле `text` бывает обрезано по пробелам в начале, а `logprobs[].token` — нет. Текст нужно собирать из токенов.

## Размышления

- Идут отдельным элементом `reasoning` и событиями `response.reasoning_text.delta`; в `/v1/chat/completions` — поле `delta.reasoning_content`.
- Логпробов у них нет ни в одном эндпоинте.
- Отключение: `reasoning: {"effort": "none"}` в `/v1/responses`, `reasoning_effort: "none"` в `/v1/chat/completions`. Значения `minimal`, `enable_thinking: false`, `chat_template_kwargs` не действуют.
- Сервер вырезает тег `</think>`, а на GGUF — и пустую строку после него.

## Продолжение частичного ответа

Незавершённое сообщение ассистента последним в `input` (или `messages`) продолжается как префилл: токен конца хода не ставится. Пробелы в начале и конце сохраняются.

При выключенных размышлениях распределение следующего токена совпало с исходным во всех точках разреза: 22 из 22 на Qwen, 21 из 21 на Bonsai, на обоих эндпоинтах.

Ограничение: при префилле шаблон всегда вставляет перед текстом пустой блок `<think>\n\n</think>\n\n`. Поэтому ветка от ответа с размышлениями продолжается в слегка другом контексте. Передать размышления отдельным элементом `reasoning` не помогает: LM Studio вставляет их вторым блоком после пустого.

Если префилл начинается с `<think>`, продолжение приходит обычным текстом с логпробами (на MLX при префилле ровно `<think>\n` — снова отдельным потоком без логпробов).

## Сэмплеры

| Параметр | `/v1/responses` | `/v1/chat/completions` |
|---|---|---|
| `temperature`, `top_p` | да | да |
| `top_k`, `min_p`, `repeat_penalty` | игнорируются | да |
| `seed` | игнорируется | да |
| `stop` | игнорируется | да |

## Прочее

- CORS включается в настройках сервера LM Studio; тогда отвечает `Access-Control-Allow-Origin: *`.
- Реальный промпт виден командой `lms log stream --source model --filter input`.
- Qwen3.5-0.8B часто рассуждает больше 1000 токенов и не доходит до ответа.
