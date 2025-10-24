const express = require("express");
const { startBot } = require("./bot");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("✅ WhatsApp bot is running...");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startBot();
});