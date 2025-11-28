(async () => {
  try {
    console.log("🚀 Starting Village Entry API...");
    await import("./index.js");
  } catch (error) {
    console.error("❌ Failed to start API:", error);
  }
})();
