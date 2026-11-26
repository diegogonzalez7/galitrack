const colors = ['#297a50', '#8251be', '#a95623', '#236aaa', '#b03e64']

export function routeColor(id: string) {
  const index = Number(id.split('-').at(-1)) - 1
  return colors[index] ?? colors[0]
}
