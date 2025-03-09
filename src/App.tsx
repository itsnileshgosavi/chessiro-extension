import DisplayChannels from "./components/displayChannels"
import Restart from "./components/restart"
import { Toaster } from "./components/ui/sonner"
function App() {

  return (
    <main className="container flex flex-col items-center justify-center w-96 h-96" >
      <h1 className="text-center font-bold text-2xl">Manage Bot</h1>
      <div className="flex justify-center mt-2 flex-col-reverse">
        <Restart/>
        <DisplayChannels/>
        <Toaster/>
      </div>
    </main>
  )
}

export default App
