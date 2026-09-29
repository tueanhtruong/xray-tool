import { assignRequestId } from '../utils/request-id'

/** Runs first for every request; see `assignRequestId`. */
export default defineEventHandler((event) => {
  assignRequestId(event)
})
