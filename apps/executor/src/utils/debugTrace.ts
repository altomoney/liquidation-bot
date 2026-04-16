import { encodeFunctionData, type Address, type Hex } from "viem";
import { executorAbi } from "executooor-viem";

interface TraceNode {
  type?: string;
  to?: string;
  input?: string;
  output?: string;
  gasUsed?: string;
  error?: string;
  calls?: TraceNode[];
}

interface DebugTraceParams {
  client: {
    account: { address: Address };
    request: (args: any) => Promise<any>;
  };
  executorAddress: Address;
  calls: readonly Hex[];
  logTag: string;
}

export async function traceFailedExecution({
  client,
  executorAddress,
  calls,
  logTag,
}: DebugTraceParams): Promise<void> {
  console.log(
    `${logTag}DEBUG: Tracing exec_606BaXt via debug_traceCall...`,
  );

  try {
    const execData = encodeFunctionData({
      abi: executorAbi,
      functionName: "exec_606BaXt",
      args: [calls],
    });

    const trace: TraceNode = await client.request({
      method: "debug_traceCall" as any,
      params: [
        {
          from: client.account.address,
          to: executorAddress,
          data: execData,
        },
        "latest",
        { tracer: "callTracer", tracerConfig: { onlyTopCall: false } },
      ],
    } as any);

    const printNode = (t: TraceNode, depth = 0) => {
      const indent = "  ".repeat(depth);
      const sel = t.input?.slice(0, 10) || "?";
      const short = `${t.type} ${t.to?.slice(0, 10) || "?"} sel=${sel} used=${t.gasUsed} ${t.error ? `ERR=${t.error}` : "OK"}`;
      console.log(`${logTag}DEBUG: ${indent}${short}`);
      if (t.error && t.output) {
        console.log(
          `${logTag}DEBUG: ${indent}  revert=${t.output.slice(0, 138)}`,
        );
      }
      if (t.calls) {
        for (const c of t.calls) printNode(c, depth + 1);
      }
    };
    printNode(trace);
  } catch (err: any) {
    console.log(
      `${logTag}DEBUG: debug_traceCall failed: ${err.shortMessage || err.message}`,
    );
  }
}
