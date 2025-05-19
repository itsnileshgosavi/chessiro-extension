import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import Form from "./form";

const DisplayChannels = () => {
  const [channels, setChannels] = useState([]);
  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    const response = await fetch(
      "https://67cc4505dd7651e464eb7b28.mockapi.io/bot/channels"
    );
    const channels = await response.json();
    setChannels(channels);
  };

  async function handleDelete(id: string) {
    const response = await fetch(
      `https://67cc4505dd7651e464eb7b28.mockapi.io/bot/channels/${id}`,
      {
        method: "DELETE",
      }
    );
    const del = await response.json();
    console.log(del);
    fetchChannels();
    toast.success("Channel deleted successfully");
  }
  return (
    <div>
      {channels.map((item: { channelId: string; id: string }) => {
        return (
          <div key={item.id} className="flex justify-between max-h-20 overflow-auto space-x-2 my-2.5">
            <p>{item.channelId}</p>
            <Button
              size={"sm"}
              variant={"destructive"}
              onClick={() => {
                handleDelete(item.id);
              }}
            >
              Delete
            </Button>
          </div>
        );
      })}
       <Form refetch={fetchChannels} />
    </div>
  );
};

export default DisplayChannels;
