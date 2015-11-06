import angular from 'angular'
import assign from 'lodash.assign'
import forEach from 'lodash.foreach'
import indexOf from 'lodash.indexof'
import later from 'later'
import moment from 'moment'
import prettyCron from 'prettycron'
import remove from 'lodash.remove'
import uiRouter from 'angular-ui-router'

later.date.localTime()

import backup from './backup'
import disasterRecovery from './disaster-recovery'
import management from './management'
import mount from './remote'
import restore from './restore'
import rollingSnapshot from './rolling-snapshot'

import view from './view'
import scheduler from './scheduler'

export default angular.module('backup', [
  uiRouter,

  backup,
  disasterRecovery,
  management,
  mount,
  restore,
  rollingSnapshot
])
  .config(function ($stateProvider) {
    $stateProvider.state('backup', {
      abstract: true,
      data: {
        requireAdmin: true
      },
      template: view,
      url: '/backup'
    })

    // Redirect to default sub-state.
    $stateProvider.state('backup.index', {
      url: '',
      controller: function ($state) {
        $state.go('backup.management')
      }
    })
  })

  .directive('xoScheduler', function () {
    return {
      restrict: 'E',
      template: scheduler,
      controller: 'XoScheduler as ctrl',
      bindToController: true,
      scope: {
        data: '=',
        api: '='
      }
    }
  })

  .controller('XoScheduler', function () {
    this.init = () => {
      let i, j

      const minutes = []
      for (i = 0; i < 6; i++) {
        minutes[i] = []
        for (j = 0; j < 10; j++) {
          minutes[i].push(10 * i + j)
        }
      }
      this.minutes = minutes

      const hours = []
      for (i = 0; i < 3; i++) {
        hours[i] = []
        for (j = 0; j < 8; j++) {
          hours[i].push(8 * i + j)
        }
      }
      this.hours = hours

      const days = []
      for (i = 0; i < 4; i++) {
        days[i] = []
        for (j = 1; j < 8; j++) {
          days[i].push(7 * i + j)
        }
      }
      days.push([29, 30, 31])
      this.days = days

      this.months = [
        [
          {v: 1, l: 'Jan'},
          {v: 2, l: 'Feb'},
          {v: 3, l: 'Mar'},
          {v: 4, l: 'Apr'},
          {v: 5, l: 'May'},
          {v: 6, l: 'Jun'}
        ],
        [
          {v: 7, l: 'Jul'},
          {v: 8, l: 'Aug'},
          {v: 9, l: 'Sep'},
          {v: 10, l: 'Oct'},
          {v: 11, l: 'Nov'},
          {v: 12, l: 'Dec'}
        ]
      ]

      this.dayWeeks = [
        {v: 0, l: 'Sun'},
        {v: 1, l: 'Mon'},
        {v: 2, l: 'Tue'},
        {v: 3, l: 'Wed'},
        {v: 4, l: 'Thu'},
        {v: 5, l: 'Fri'},
        {v: 6, l: 'Sat'}
      ]
      this.resetData()
    }

    this.selectMinute = function (minute) {
      if (this.isSelectedMinute(minute)) {
        remove(this.data.minSelect, v => String(v) === String(minute))
      } else {
        this.data.minSelect.push(minute)
      }
    }

    this.isSelectedMinute = function (minute) {
      return indexOf(this.data.minSelect, minute) > -1 || indexOf(this.data.minSelect, String(minute)) > -1
    }

    this.selectHour = function (hour) {
      if (this.isSelectedHour(hour)) {
        remove(this.data.hourSelect, v => String(v) === String(hour))
      } else {
        this.data.hourSelect.push(hour)
      }
    }

    this.isSelectedHour = function (hour) {
      return indexOf(this.data.hourSelect, hour) > -1 || indexOf(this.data.hourSelect, String(hour)) > -1
    }

    this.selectDay = function (day) {
      if (this.isSelectedDay(day)) {
        remove(this.data.daySelect, v => String(v) === String(day))
      } else {
        this.data.daySelect.push(day)
      }
    }

    this.isSelectedDay = function (day) {
      return indexOf(this.data.daySelect, day) > -1 || indexOf(this.data.daySelect, String(day)) > -1
    }

    this.selectMonth = function (month) {
      if (this.isSelectedMonth(month)) {
        remove(this.data.monthSelect, v => String(v) === String(month))
      } else {
        this.data.monthSelect.push(month)
      }
    }

    this.isSelectedMonth = function (month) {
      return indexOf(this.data.monthSelect, month) > -1 || indexOf(this.data.monthSelect, String(month)) > -1
    }

    this.selectDayWeek = function (dayWeek) {
      if (this.isSelectedDayWeek(dayWeek)) {
        remove(this.data.dayWeekSelect, v => String(v) === String(dayWeek))
      } else {
        this.data.dayWeekSelect.push(dayWeek)
      }
    }

    this.isSelectedDayWeek = function (dayWeek) {
      return indexOf(this.data.dayWeekSelect, dayWeek) > -1 || indexOf(this.data.dayWeekSelect, String(dayWeek)) > -1
    }

    this.noMinutePlan = function (set = false) {
      if (!set) {
        // The last part (after &&) of this expression is reliable because we maintain the minSelect array with lodash.remove
        return this.data.min === 'select' && this.data.minSelect.length === 1 && String(this.data.minSelect[0]) === '0'
      } else {
        this.data.minSelect = [0]
        this.data.min = 'select'
        return true
      }
    }

    this.noHourPlan = function (set = false) {
      if (!set) {
        // The last part (after &&) of this expression is reliable because we maintain the hourSelect array with lodash.remove
        return this.data.hour === 'select' && this.data.hourSelect.length === 1 && String(this.data.hourSelect[0]) === '0'
      } else {
        this.data.hourSelect = [0]
        this.data.hour = 'select'
        return true
      }
    }

    this.resetData = () => {
      this.data.minRange = 5
      this.data.hourRange = 2
      this.data.minSelect = [0]
      this.data.hourSelect = []
      this.data.daySelect = []
      this.data.monthSelect = []
      this.data.dayWeekSelect = []
      this.data.min = 'select'
      this.data.hour = 'all'
      this.data.day = 'all'
      this.data.month = 'all'
      this.data.dayWeek = 'all'
      this.data.cronPattern = '* * * * *'
      this.data.summary = []
      this.data.previewLimit = 0

      this.update()
    }

    this.update = () => {
      const d = this.data
      const i = (d.min === 'all' && '*') ||
        (d.min === 'range' && ('*/' + d.minRange)) ||
        (d.min === 'select' && d.minSelect.join(',')) ||
        '*'
      const h = (d.hour === 'all' && '*') ||
        (d.hour === 'range' && ('*/' + d.hourRange)) ||
        (d.hour === 'select' && d.hourSelect.join(',')) ||
        '*'
      const dm = (d.day === 'all' && '*') ||
        (d.day === 'select' && d.daySelect.join(',')) ||
        '*'
      const m = (d.month === 'all' && '*') ||
        (d.month === 'select' && d.monthSelect.join(',')) ||
        '*'
      const dw = (d.dayWeek === 'all' && '*') ||
        (d.dayWeek === 'select' && d.dayWeekSelect.join(',')) ||
        '*'
      this.data.cronPattern = i + ' ' + h + ' ' + dm + ' ' + m + ' ' + dw

      const tabState = {
        min: {
          all: d.min === 'all',
          range: d.min === 'range',
          select: d.min === 'select'
        },
        hour: {
          all: d.hour === 'all',
          range: d.hour === 'range',
          select: d.hour === 'select'
        },
        day: {
          all: d.day === 'all',
          range: d.day === 'range',
          select: d.day === 'select'
        },
        month: {
          all: d.month === 'all',
          select: d.month === 'select'
        },
        dayWeek: {
          all: d.dayWeek === 'all',
          select: d.dayWeek === 'select'
        }
      }
      this.tabs = tabState
      this.summarize()
    }

    this.summarize = () => {
      const schedule = later.parse.cron(this.data.cronPattern)
      const occurences = later.schedule(schedule).next(25)
      this.data.summary = []
      forEach(occurences, occurence => {
        this.data.summary.push(moment(occurence).format('LLLL'))
      })
    }

    const cronToData = (data, cron) => {
      const d = Object.create(null)
      const cronItems = cron.split(' ')

      if (cronItems[0] === '*') {
        d.min = 'all'
      } else if (cronItems[0].indexOf('/') !== -1) {
        d.min = 'range'
        const [, range] = cronItems[0].split('/')
        d.minRange = range
      } else {
        d.min = 'select'
        d.minSelect = cronItems[0].split(',')
      }

      if (cronItems[1] === '*') {
        d.hour = 'all'
      } else if (cronItems[1].indexOf('/') !== -1) {
        d.hour = 'range'
        const [, range] = cronItems[1].split('/')
        d.hourRange = range
      } else {
        d.hour = 'select'
        d.hourSelect = cronItems[1].split(',')
      }

      if (cronItems[2] === '*') {
        d.day = 'all'
      } else {
        d.day = 'select'
        d.daySelect = cronItems[2].split(',')
      }

      if (cronItems[3] === '*') {
        d.month = 'all'
      } else {
        d.month = 'select'
        d.monthSelect = cronItems[3].split(',')
      }

      if (cronItems[4] === '*') {
        d.dayWeek = 'all'
      } else {
        d.dayWeek = 'select'
        d.dayWeekSelect = cronItems[4].split(',')
      }

      assign(data, d)
    }

    this.prettyCron = prettyCron.toString.bind(prettyCron)

    this.api.setCron = cron => {
      cronToData(this.data, cron)
      this.update()
    }
    this.api.resetData = this.resetData.bind(this)

    this.init()
  })

  .name
