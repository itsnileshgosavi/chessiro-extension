import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "./ui/dialog";
import { DialogTitle, DialogTrigger } from "@radix-ui/react-dialog";

const Restart = () => {
  return (
    <div>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant={"secondary"}>Restart Bot</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogFooter>
            <DialogClose>
              <Button>Restart</Button>
              <Button variant={"ghost"}>Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Restart;
