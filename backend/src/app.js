import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());


export { app };