import { Button } from "./ui/button";
import { Card, CardTitle, CardContent, CardFooter } from "./ui/card";
import { Input } from "./ui/input";
import { useState } from "react";
import { toast } from "sonner";

const Form = ({refetch}:{refetch:()=>void}) => {
  const [channel, setChannel] = useState("");
  const AddChannel = async () => {
    try {
      if (!channel.trim()) {
        toast.error("Please enter a channel name");
        return;
      }
      const res = await fetch(
        `https://67cc4505dd7651e464eb7b28.mockapi.io/bot/channels`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ channelId: channel }),
        }
      );
      const data = await res.json();
      console.log(data);
      toast.success("Channel added successfully");
      refetch();
    } catch (error) {
      console.log(error);
    }
  };
  return (
    <Card className="my-2">
      <CardTitle className="text-center">Add a new channel</CardTitle>
      <CardContent>
        <Input
          onChange={(e) => setChannel(e.target.value)}
          placeholder="Channel Name"
          className="my-2"
        />
        <CardFooter className="flex justify-end">
          <Button onClick={() => AddChannel()}>Add</Button>
        </CardFooter>
      </CardContent>
    </Card>
  );
};

export default Form;
