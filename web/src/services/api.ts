const API_BASE_URL = '/api'

export interface GetConfigResponse {
  app_id: string
  token: string
  uid: string
  channel_name: string
  agent_uid: string
}

export async function getConfig(options?: { channel?: string; uid?: string | number }): Promise<GetConfigResponse> {
  const params = new URLSearchParams()
  if (options?.channel !== undefined && options.channel !== '') {
    params.set('channel', options.channel)
  }
  if (options?.uid !== undefined && options.uid !== '') {
    params.set('uid', String(options.uid))
  }

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/get_config${query ? `?${query}` : ''}`, {
    method: 'GET',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const result = await response.json()
  if (result.code !== 0 || !result.data) {
    throw new Error(result.msg || 'Failed to get configuration')
  }
  return result.data
}

export async function startAgent(channelName: string, rtcUid: number, userUid: number, carId?: number): Promise<string> {
  const payload = { 
    channelName, 
    rtcUid, 
    userUid, 
    parameters: carId ? { carId: String(carId) } : undefined
  }

  const response = await fetch(`${API_BASE_URL}/startAgent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const result = await response.json()
  if (result.code !== 0 || !result.data?.agent_id) {
    throw new Error(result.msg || 'Failed to start agent')
  }
  return result.data.agent_id
}

export async function stopAgent(agentId: string): Promise<void> {
  if (!agentId) return

  const response = await fetch(`${API_BASE_URL}/stopAgent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }
}

export interface Car {
  id: number
  make: string
  model: string
  year: number
  color: string
  mileage: number
  transmission: string
  fuel_type: string
  condition: string
  asking_price: number
  floor_price: number
  location: string
  registration_expiry: string
  accident_free: number
  status: string
}

export interface Lead {
  id: number
  buyer_name: string | null
  buyer_phone: string | null
  car_id: number
  final_offer: number | null
  outcome: string
  lead_score: 'Hot' | 'Warm' | 'Cold'
  summary: string
  created_at: string
  make: string
  model: string
  year: number
  asking_price: number
}

export interface CallLog {
  id: number
  session_id: string
  car_id: number
  duration: number
  transcript: string | null
  created_at: string
  make: string
  model: string
  year: number
}

export async function getInventory(): Promise<Car[]> {
  const response = await fetch(`${API_BASE_URL}/inventory`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const result = await response.json()
  if (result.code !== 0) throw new Error(result.msg || 'Failed to fetch inventory')
  return result.data
}

export async function addInventory(car: Omit<Car, 'id' | 'status'>): Promise<number> {
  const response = await fetch(`${API_BASE_URL}/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(car),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const result = await response.json()
  if (result.code !== 0) throw new Error(result.msg || 'Failed to add car')
  return result.data.car_id
}

export async function getLeads(): Promise<Lead[]> {
  const response = await fetch(`${API_BASE_URL}/leads`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const result = await response.json()
  if (result.code !== 0) throw new Error(result.msg || 'Failed to fetch leads')
  return result.data
}

export async function getCalls(): Promise<CallLog[]> {
  const response = await fetch(`${API_BASE_URL}/calls`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const result = await response.json()
  if (result.code !== 0) throw new Error(result.msg || 'Failed to fetch calls')
  return result.data
}

export async function updateCarStatus(carId: number, status: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/inventory_status?car_id=${carId}&status=${status}`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const result = await response.json()
  if (result.code !== 0) throw new Error(result.msg || 'Failed to update status')
}
