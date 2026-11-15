import { useState } from "react";
import "./App.css";

function App() {
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");
  const [transaction, setTransaction] = useState("");

  async function sendMessage() {
    setTransaction("Đang gửi giao dịch...");

    const response = await fetch("http://localhost:8000/set-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: input })
    });

    const data = await response.json();

    setTransaction(`Status: ${data.status} | TX: ${data.tx_hash}`);
  }

  async function getMessage() {
    const response = await fetch("http://localhost:8000/get-message");
    const data = await response.json();

    setMessage(data.message);
  }

  return (
    <div className="container">
      <h1>SimpleMessage</h1>

      <section>
        <h2>setMessage</h2>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập message"
        />

        <button onClick={sendMessage}>Gửi</button>

        <p className="result">{transaction}</p>
      </section>

      <section>
        <h2>getMessage</h2>

        <button onClick={getMessage}>Call</button>

        <p>Message: {message}</p>
      </section>
    </div>
  );
}

export default App;
