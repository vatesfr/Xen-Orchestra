interface GeneralParamsModal {
  message: JSX.Element
  title: JSX.Element
}

export const confirm = ({ message }: GeneralParamsModal): Promise<string> =>
  new Promise((resolve, reject) =>
    window.confirm(message.props.id ?? message.props.children) ? resolve('Success') : reject(new Error())
  )
