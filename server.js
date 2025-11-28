(async () => {
  try {
    await import("./index.js");
  } catch (error) {
    console.error("❌ Error starting app:", error);
  }
})();
