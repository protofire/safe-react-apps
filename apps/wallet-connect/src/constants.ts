const { REACT_APP_WALLETCONNECT_PROJECT_ID, NODE_ENV } = process.env

export const isProduction = NODE_ENV === 'production'

export const WALLETCONNECT_V2_PROJECT_ID = REACT_APP_WALLETCONNECT_PROJECT_ID
