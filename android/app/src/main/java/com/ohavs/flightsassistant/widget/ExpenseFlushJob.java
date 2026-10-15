package com.ohavs.flightsassistant.widget;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Sends the expenses the home screen queued offline, once there is a network (ExpenseStore). */
public class ExpenseFlushJob extends JobService {

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            boolean done = ExpenseStore.flush(getApplicationContext());
            jobFinished(params, !done);
        }, "expense-flush").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
