// utils/pathMap.js
const path = require("path");

const HOST_DATA_DIR = process.env.HOST_DATA_DIR || "/home/ubuntu/weather_cloth_3/data";
const CONTAINER_DATA_DIR = process.env.CONTAINER_DATA_DIR || process.env.DATA_DIR || "/weather_cloth_3/data";

const toHostPath = (p) => {
  if (!p) return p;
  // 컨테이너 경로를 호스트 경로로
  if (p.startsWith(CONTAINER_DATA_DIR)) {
    return p.replace(CONTAINER_DATA_DIR, HOST_DATA_DIR);
  }
  return p;
};

const toContainerPath = (p) => {
  if (!p) return p;
  // 호스트 경로를 컨테이너 경로로
  if (p.startsWith(HOST_DATA_DIR)) {
    return p.replace(HOST_DATA_DIR, CONTAINER_DATA_DIR);
  }
  return p;
};

const containerWorkDir = (userId, clothId) =>
  path.join(CONTAINER_DATA_DIR, String(userId), "cloth", String(clothId));

module.exports = { HOST_DATA_DIR, CONTAINER_DATA_DIR, toHostPath, toContainerPath, containerWorkDir };
