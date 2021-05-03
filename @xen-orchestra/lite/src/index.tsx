import React from 'react'
import ReactDOM from 'react-dom'
import App from './App/index'
import { createGlobalStyle } from 'styled-components'

const GlobalStyle = createGlobalStyle`
  body {
    margin: 0;
    font-family: Arial, Verdana, Helvetica, Ubuntu, sans-serif;
    box-sizing: border-box;
    color: #212529;
  }
`

ReactDOM.render(
  <React.StrictMode>
    <GlobalStyle />
    <App />
  </React.StrictMode>,
  document.getElementById('root')
)
