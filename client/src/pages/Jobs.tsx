import { useJobs } from "@/hooks/use-trading-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default function Jobs() {
  const { data: jobs, isLoading, isError, error } = useJobs();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Background Jobs</h2>
      </div>

      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">System Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-background/50">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead>Task Type</TableHead>
                  <TableHead>Bot ID</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading tasks...
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-danger">
                      {(error as Error)?.message || "Failed to load jobs"}
                    </TableCell>
                  </TableRow>
                ) : !jobs || jobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No active jobs.
                    </TableCell>
                  </TableRow>
                ) : (
                  jobs.map((job) => (
                    <TableRow key={job.id} className="border-border/50 hover:bg-white/[0.02]">
                      <TableCell className="font-medium">{job.task}</TableCell>
                      <TableCell className="font-numeric text-muted-foreground">
                        {job.bot_id == null ? "-" : `#${job.bot_id}`}
                      </TableCell>
                      <TableCell className="w-[30%]">
                        <div className="flex items-center gap-3">
                          <Progress value={job.progress} className="h-2 bg-secondary" />
                          <span className="text-xs font-numeric text-muted-foreground">{job.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-mono text-xs ${
                            job.status === "completed"
                              ? "bg-success/10 text-success border-success/20"
                              : job.status === "failed"
                                ? "bg-danger/10 text-danger border-danger/20"
                                : "bg-warning/10 text-warning border-warning/20"
                          }`}
                        >
                          {job.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
