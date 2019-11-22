// this function is like `Promise.all`, the only difference is that it not
// short-circuits when a promise rejects
export const all = async iterable => {
  let firstRejectedPromiseReason

  const resolutions = await Promise.all(
    Array.from(iterable, promise =>
      promise.catch(reason => {
        if (firstRejectedPromiseReason === undefined) {
          firstRejectedPromiseReason = reason
        }
      })
    )
  )

  if (firstRejectedPromiseReason !== undefined) {
    throw firstRejectedPromiseReason
  }
  return resolutions
}
