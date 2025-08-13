const mongoose = require("mongoose");
require("dotenv").config();  //.env의 환경 변수 사용을 위해 

// db 연결 함수 정의

const dbConnect = async() => {
    try{
        const connect = await mongoose.connect(process.env.DB_CONNECT);
        console.log("DB Connected");
    } catch(err) {
        console.log(err);
    }
};

module.exports = dbConnect;