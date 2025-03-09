import Restart from "./components/restart"
function App() {

  return (
    <main className="flex flex-col items-center w-96 h-96" >
      <h1 className="text-center font-bold text-2xl">Manage Bot</h1>
      <div className="flex justify-center mt-2">
        <Restart/>
      </div>
    </main>
  )
}

export default App
