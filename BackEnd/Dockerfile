# Node.js 버전 22.16.0 사용
FROM node:22.16.0 

# 작업 디렉토리 설정
WORKDIR /app

# 의존성 설치용 파일 복사
COPY package*.json ./
RUN npm install

# 전체 소스 코드 복사
COPY . .

# Express 서버 포트 오픈
EXPOSE 3000

# 서버 실행 (개발용)
CMD ["npm", "run", "dev"]