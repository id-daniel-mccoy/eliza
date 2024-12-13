import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import "./App.css";

type Agent = {
    id: string;
    name: string;
};

// Helper function to determine if we're running on IC
const isIC = () => {
    return window.location.host.includes('.localhost:8001') ||
           window.location.host.includes('.icp0.io');
};

function Agents() {
    const navigate = useNavigate();
    const { data: agents, isLoading } = useQuery({
        queryKey: ["agents"],
        queryFn: async () => {
            // If running on IC, use the local server directly
            const baseUrl = isIC()
                ? 'http://localhost:3000'
                : '/api';

            const res = await fetch(`${baseUrl}/agents`);
            const data = await res.json();
            return data.agents as Agent[];
        },
    });

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <h1 className="text-2xl font-bold mb-8">Select your agent:</h1>

            {isLoading ? (
                <div>Loading agents...</div>
            ) : (
                <div className="grid gap-4 w-full max-w-md">
                    {agents?.map((agent) => (
                        <Button
                            key={agent.id}
                            className="w-full text-lg py-6"
                            onClick={() => {
                                navigate(`/${agent.id}`);
                            }}
                        >
                            {agent.name}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Agents;