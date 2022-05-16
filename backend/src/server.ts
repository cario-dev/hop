import path from 'path'
import express from 'express'
import { port } from './config'
import { Controller } from './controller'
import cors from 'cors'
import { ipRateLimitMiddleware } from './rateLimit'

const app = express()
const controller = new Controller()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(ipRateLimitMiddleware)

app.use('/static', express.static('static'))

app.get('/', (req: any, res: any) => {
  res.status(404).json({ error: 'not found' })
})

app.get('/health', (req: any, res: any) => {
  res.status(200).json({ status: 'ok' })
})

app.get('/index', (req: any, res: any) => {
  res.sendFile(path.resolve(__dirname, '..', 'public/index.html'))
})

const host = '0.0.0.0'
app.listen(port, host, () => {
  console.log(`Listening on port ${port}`)
})
