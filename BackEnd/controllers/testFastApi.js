const axios = require("axios");

async function callAIServer() {
  try {
    const response = await axios.post("http://localhost:5000/make-3d", {
      imageUrl: "http://localhost:3000/uploads/front123.jpg"
    });

    console.log("✅ AI 서버 응답:", response.data);
  } catch (error) {
    console.error("❌ AI 서버 요청 실패:", error.message);
  }
}

module.exports = callAIServer;