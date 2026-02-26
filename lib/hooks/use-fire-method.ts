'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type FireMethod, getSwrForMethod } from '@/lib/horizon-data'

export function useFireMethod() {
  const [method, setMethodState] = useState<FireMethod>('classic')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      supabase
        .from('profiles')
        .select('fire_method')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.fire_method === 'nl' || data?.fire_method === 'classic') {
            setMethodState(data.fire_method as FireMethod)
          }
          setLoading(false)
        })
    })
  }, [])

  async function setMethod(newMethod: FireMethod) {
    setMethodState(newMethod)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('profiles')
      .update({ fire_method: newMethod })
      .eq('id', user.id)
  }

  const swr = getSwrForMethod(method)

  return {
    method,
    swr,
    multiplier: 1 / swr,
    setMethod,
    loading,
  }
}
