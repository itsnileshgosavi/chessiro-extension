import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "./ui/dialog";
import { DialogTitle, DialogTrigger } from "@radix-ui/react-dialog";
import { toast } from "sonner";

const Restart = () => {

  const handleRestart = async() => {
    const res = await fetch("http://65.0.11.160:3000/restart/Nilesh@123")
    const data = await res.json()
    console.log(data)
    toast.success("Bot restarted successfully")
  }
  return (
    <div>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Restart Bot</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogFooter>
            <DialogClose>
              <Button onClick={handleRestart}>Restart</Button>
              <Button variant={"ghost"}>Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Restart;
