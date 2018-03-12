declare module 'promise-toolbox' {
  declare export function cancelable(Function): Function
  declare export function defer<T>(): {|
    promise: Promise<T>,
    reject: T => void,
    resolve: T => void
  |}
  declare export function fromEvent(emitter: mixed, string): Promise<mixed>
  declare export function ignoreErrors(): Promise<void>
  declare export function timeout<T>(delay: number): Promise<T>
}
