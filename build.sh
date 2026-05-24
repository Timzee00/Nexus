#!/bin/bash

echo "Generating config.js..."

cat > config.js <<EOF
window.NEXUS_CONFIG = {
  SUPABASE_URL: "${SUPABASE_URL}",
  SUPABASE_ANON: "${SUPABASE_ANON}"
};
EOF

echo "config.js generated!"
