import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Spin } from 'antd'
import { api } from '../api'
import { loadPrefs } from './prefs'
import type { AppConfig } from '../types'

interface Ctx {
  config: AppConfig | null
  error: string | null
  reload: () => Promise<void>
  setConfig: (c: AppConfig) => void
}

const ConfigContext = createContext<Ctx>({ config: null, error: null, reload: async () => {}, setConfig: () => {} })

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prefsReady, setPrefsReady] = useState(false)

  const reload = useCallback(async () => {
    try {
      setConfig(await api.getConfig())
      setError(null)
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    // Tercihler (kolon düzeni, seçili siparişler...) ekran çizilmeden önce sunucudan alınır
    loadPrefs().finally(() => setPrefsReady(true))
    reload()
  }, [reload])

  if (!prefsReady) return <div style={{ textAlign: 'center', padding: 120 }}><Spin size="large" /></div>
  return <ConfigContext.Provider value={{ config, error, reload, setConfig }}>{children}</ConfigContext.Provider>
}

export const useConfig = () => useContext(ConfigContext)
