module.exports = {
  apps: [{
    name: 'khaanrate',
    script: '/tmp/khaanrate/bot.js',
    env: {
      BOT_TOKEN: '8693287131:AAFSfWkn4jwJWHb8Bmy2OVivDgc8zOq_QcI',
      SUPABASE_URL: 'https://sedtcjccbloolchbzndj.supabase.co',
      SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZHRjamNjYmxvb2xjaGJ6bmRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExMzQ0MCwiZXhwIjoyMDkxNjg5NDQwfQ.bca34Jq2syNqmicKAbk8u87Otnkm1uE3eN6cQFZl2mM',
    },
    max_memory_restart: '400M',
    restart_delay: 5000,
    max_restarts: 10,
    autorestart: true,
  }]
};
