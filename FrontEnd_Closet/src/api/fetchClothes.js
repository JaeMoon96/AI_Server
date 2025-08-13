// src/api/fetchClothes.js
const BASE_URL = "http://15.165.129.131:3000/api/cloth";

export async function fetchClothesByCategory(category) {
  const token = localStorage.getItem("token");

  try {
    const res = await fetch(`${BASE_URL}?category=${category}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include"
    });

    if (!res.ok) throw new Error("옷 불러오기 실패");

    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`[${category}] 옷 불러오기 에러:`, err);
    return [];
  }
}
