const dateTool = {
    getMonth: (month) => {
        if (month === 0) {
            return 'January'
        } 
        else if (month === 1) {
            return 'February'
        } 
        else if (month === 2) {
            return 'March'
        } 
        else if (month === 3) {
            return 'April'
        } 
        else if (month === 4) {
            return 'May'
        }  
        else if (month === 5) {
            return 'June'
        }  
        else if (month === 6) {
            return 'July'
        }  
        else if (month === 7) {
            return 'August'
        } 
        else if (month === 8) {
            return 'September'
        }  
        else if (month === 9) {
            return 'October'
        }  
        else if (month === 10) {
            return 'November'
        } 
        else if (month === 11) {
            return 'December'
        }
    },
    getDay: (day) => {
        if (day === 0) {
            return 'Sunday';
        }
        else if (day === 1) {
            return 'Monday';
        }
        else if (day === 2) {
            return 'Tuesday';
        }
        else if (day === 3) {
            return 'Wednesday';
        }
        else if (day === 4) {
            return 'Thursday';
        }
        else if (day === 5) {
            return 'Friday';
        }
        else if (day === 6) {
            return 'Saturday';
        }
    },
    getTime: (dateTime) => {
        const d = new Date(dateTime);
        let hour = d.getHours();
        let minute = d.getMinutes();
        let amPM;

        if (hour > 11) {
            amPM = 'PM';
        } else {
            amPM = 'AM';
        }

        hour = hour % 12;

        if (hour === 0) {
            hour = 12;
        }

        if (minute < 10) {
            minute = "0" + minute;
        }

        return hour + ':' + minute + ' ' + amPM;

    },
    getDateTime: (dateTime, date = true, weekDay = false ) => {
        const d = new Date(dateTime);
        if (!date && weekDay) {
            return dateTool.getDay(d.getDay()) + ' at ' + dateTool.getTime(dateTime);
        }
        else if (date && weekDay) {
            const month = d.getMonth();
            const date = d.getDate();
            return dateTool.getDay(d.getDay()) + ' ' + dateTool.getMonth(month) + ' ' + date + ' at ' + dateTool.getTime(dateTime);
        }
        else {
            const month = d.getMonth();
            const date = d.getDate();
            return dateTool.getMonth(month) + ' ' + date + ' at ' + dateTool.getTime(dateTime);
        }
    },
    // These functions return date objects, use valueOf() to get dateTime
    getTomorrow: () => {
        const d = new Date();
        d.setHours(0,0,0,0)
        d.setDate(d.getDate() + 1);
        return d;
    },
    getDayAfterTomorrow: () => {
        const d = new Date();
        d.setHours(0,0,0,0)
        d.setDate(d.getDate() + 2);
        return d;
    },
    getEndOfWeek: () => {
        const d = new Date();
        d.setHours(0,0,0,0)
        const offset = 7 - d.getDay();
        d.setDate(d.getDate() + offset);
        return d;
    },
    getEndOfNextWeek: () => {
        const d = new Date();
        d.setHours(0,0,0,0)
        const offset = 14 - d.getDay();
        d.setDate(d.getDate() + offset);
        return d;
    },
}

module.exports = dateTool;