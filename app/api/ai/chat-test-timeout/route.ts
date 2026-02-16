/**
 * Test endpoint that simulates AI chat timeout/errors for feature #105 verification.
 *
 * Query params:
 *   ?mode=timeout  — waits 5s then returns 504
 *   ?mode=error    — returns immediate 500
 *   ?mode=success  — streams a normal response
 */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') || 'timeout'

  if (mode === 'timeout') {
    // Simulate a timeout: wait 5 seconds then return 504
    await new Promise((resolve) => setTimeout(resolve, 5000))
    return Response.json(
      { error: 'Het AI-antwoord duurde te lang. Probeer het opnieuw met een kortere vraag.' },
      { status: 504 },
    )
  }

  if (mode === 'error') {
    return Response.json(
      { error: 'Er ging iets mis bij het genereren van een antwoord. Probeer het opnieuw.' },
      { status: 500 },
    )
  }

  // Success mode: stream a simple text response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      // Send a simple AI SDK compatible stream
      const lines = [
        '0:{"text":"Hallo! Ik ben je AI-assistent. "}\n',
        '0:{"text":"Dit is een testbericht "}\n',
        '0:{"text":"om te verifi\\u00EBren dat de chat werkt."}\n',
        'e:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":20}}\n',
        'd:{"finishReason":"stop"}\n',
      ]
      for (const line of lines) {
        controller.enqueue(encoder.encode(line))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
