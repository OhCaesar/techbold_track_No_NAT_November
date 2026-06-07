#!/usr/bin/env bash
# Fetches all persisted messages for a chat from the backend.
# Usage: ./get_chat_messages.sh <chat_id>

CHAT_ID="${1:?Usage: $0 <chat_id>}"
BASE_URL="${BACKEND_URL:-http://localhost:80}"

curl -s "${BASE_URL}/api/chats/${CHAT_ID}/messages" | python3 -m json.tool
