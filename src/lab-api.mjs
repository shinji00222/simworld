export async function post(path, input) {
  const response = await fetch('/simworld/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SimWorld-Request': '1' }, body: JSON.stringify(input),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || '请求失败')
  return result
}
export function downloadConfig(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name + '.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
