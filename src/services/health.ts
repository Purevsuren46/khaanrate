export const healthRouter = {
  check: async () => {
    return { status: 'ok', timestamp: Date.now(), config: {/* subset */} };
  }
};
