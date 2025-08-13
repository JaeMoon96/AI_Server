const errorhandler = (err, req, res, next) => {
  const status = err.status || 500;

  // ✅ 로그 출력 추가
  console.error("❌ [에러 발생]", {
    status,
    message: err.message,
    stack: err.stack
  });

  switch (status) {
    case 400:
      res.status(status).json({ title: "Bad Request", message: err.message });
      break;
    case 401:
      res.status(status).json({ title: "Unauthorized", message: err.message });
      break;
    case 403:
      res.status(status).json({ title: "Forbidden", message: err.message });
      break;
    case 404:
      res.status(status).json({ title: "Not Found", message: err.message });
      break;
    case 500:
      res.status(status).json({ title: "Internal Server Error", message: err.message });
      break;
    default:
      res.status(status).json({ title: "Unknown Error", message: err.message });
      break;
  }
};
module.exports = errorhandler;
